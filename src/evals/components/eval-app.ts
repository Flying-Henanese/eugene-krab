import { Container, Spacer, Text, type TUI } from '@mariozechner/pi-tui';
import { theme } from '../../theme.js';
import { EvalCurrentQuestion } from './eval-current-question.js';
import { EvalProgress } from './eval-progress.js';
import { EvalRecentResults, type EvalResult } from './eval-recent-results.js';
import { EvalStats } from './eval-stats.js';

const SHOW_STATS = true;

interface EvalState {
  status: 'loading' | 'running' | 'complete';
  total: number;
  completed: number;
  correct: number;
  pending: number;
  currentQuestion: string | null;
  results: EvalResult[];
  startTime: number;
  experimentName: string | null;
  datasetName: string | null;
  reviewPath: string | null;
}

export interface EvalProgressEvent {
  type: 'init' | 'question_start' | 'question_end' | 'complete';
  total?: number;
  datasetName?: string;
  question?: string;
  score?: number | null;
  behaviorPass?: boolean;
  comment?: string;
  experimentName?: string;
  reviewPath?: string;
  averageScore?: number;
}

export class EvalApp extends Container {
  private readonly tui: TUI;
  private readonly runEvaluation: () => AsyncGenerator<EvalProgressEvent, void, unknown>;
  private readonly progress = new EvalProgress();
  private readonly currentQuestion: EvalCurrentQuestion;
  private readonly stats: EvalStats;
  private readonly recentResults = new EvalRecentResults();
  private state: EvalState = {
    status: 'loading',
    total: 0,
    completed: 0,
    correct: 0,
    pending: 0,
    currentQuestion: null,
    results: [],
    startTime: Date.now(),
    experimentName: null,
    datasetName: null,
    reviewPath: null,
  };

  constructor(tui: TUI, runEvaluation: () => AsyncGenerator<EvalProgressEvent, void, unknown>) {
    super();
    this.tui = tui;
    this.runEvaluation = runEvaluation;
    this.currentQuestion = new EvalCurrentQuestion(tui);
    this.stats = new EvalStats(tui);
    this.renderState();
  }

  async run() {
    for await (const event of this.runEvaluation()) {
      switch (event.type) {
        case 'init':
          this.state = {
            ...this.state,
            status: 'running',
            total: event.total ?? 0,
            datasetName: event.datasetName ?? null,
            startTime: Date.now(),
          };
          break;
        case 'question_start':
          this.state = {
            ...this.state,
            currentQuestion: event.question ?? null,
          };
          break;
        case 'question_end': {
          const exactPass = event.score === 1 && event.behaviorPass !== false;
          const pending = event.score === null;
          this.state = {
            ...this.state,
            completed: this.state.completed + 1,
            correct: this.state.correct + (exactPass ? 1 : 0),
            pending: this.state.pending + (pending ? 1 : 0),
            currentQuestion: null,
            results: [
              ...this.state.results,
              {
                question: event.question ?? '',
                score: event.score === undefined ? 0 : event.score,
                comment: event.comment ?? '',
                behaviorPass: event.behaviorPass ?? true,
              },
            ],
          };
          break;
        }
        case 'complete':
          this.state = {
            ...this.state,
            status: 'complete',
            experimentName: event.experimentName ?? null,
            reviewPath: event.reviewPath ?? null,
            currentQuestion: null,
          };
          break;
      }

      this.renderState();
      this.tui.requestRender();
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }

  dispose() {
    this.currentQuestion.dispose();
    this.stats.dispose();
  }

  private renderState() {
    this.clear();

    if (this.state.status === 'loading') {
      this.addChild(new Text(theme.bold(theme.primary('Eugene Krab Eval')), 0, 0));
      this.addChild(new Text(theme.muted('Loading dataset...'), 0, 0));
      return;
    }

    if (this.state.status === 'complete') {
      this.renderCompleteState();
      return;
    }

    this.renderRunningState();
  }

  private renderRunningState() {
    const datasetLabel = this.state.datasetName ? ` • ${this.state.datasetName}` : '';
    this.addChild(new Text(`${theme.bold(theme.primary('Eugene Krab Eval'))}${theme.muted(datasetLabel)}`, 0, 0));
    this.addChild(new Spacer(1));

    this.progress.setProgress(this.state.completed, this.state.total);
    this.addChild(this.progress);

    this.currentQuestion.setQuestion(this.state.currentQuestion);
    if (this.state.currentQuestion) {
      this.addChild(new Spacer(1));
      this.addChild(this.currentQuestion);
    }

    if (SHOW_STATS) {
      this.addChild(new Spacer(1));
      this.stats.setStats(
        this.state.correct,
        this.state.completed - this.state.correct - this.state.pending,
        this.state.startTime,
        this.state.pending,
      );
      this.addChild(this.stats);
    }

    this.recentResults.setResults(this.state.results, 5);
    if (this.state.results.length > 0) {
      this.addChild(new Spacer(1));
      this.addChild(this.recentResults);
    }
  }

  private renderCompleteState() {
    this.currentQuestion.setQuestion(null);
    this.stats.setStats(
      this.state.correct,
      this.state.completed - this.state.correct - this.state.pending,
      null,
      this.state.pending,
    );

    const scoredResults = this.state.results.filter(
      (result): result is EvalResult & { score: number } => result.score !== null,
    );
    const avgScore =
      scoredResults.length > 0
        ? scoredResults.reduce((sum, result) => sum + result.score, 0) / scoredResults.length
        : 0;

    this.addChild(new Text('═'.repeat(70), 0, 0));
    this.addChild(new Text(theme.bold('EVALUATION COMPLETE'), 0, 0));
    this.addChild(new Text('═'.repeat(70), 0, 0));
    this.addChild(new Text(`Experiment: ${this.state.experimentName ?? 'unknown'}`, 0, 0));
    this.addChild(new Text(`Examples evaluated: ${this.state.results.length}`, 0, 0));
    this.addChild(new Text(
      scoredResults.length > 0
        ? `Average correctness score: ${theme.bold(theme.primary(`${(avgScore * 100).toFixed(1)}%`))}`
        : 'Average correctness score: pending manual review',
      0,
      0,
    ));
    if (this.state.reviewPath) {
      this.addChild(new Text(`Manual review artifact: ${this.state.reviewPath}`, 0, 0));
    }
    this.addChild(new Spacer(1));
    this.addChild(new Text('Results by question:', 0, 0));
    this.addChild(new Text('─'.repeat(70), 0, 0));

    for (const result of this.state.results) {
      const pending = result.score === null;
      const exactPass = result.score === 1 && result.behaviorPass;
      const icon = pending && result.behaviorPass ? '○' : exactPass ? '✓' : '✗';
      const iconColor = pending && result.behaviorPass
        ? theme.primary
        : exactPass
          ? theme.success
          : theme.error;
      const semanticLabel = result.score === null ? 'pending' : result.score.toFixed(2);
      this.addChild(
        new Text(
          `${iconColor(icon)} ${theme.muted(
            `[semantic ${semanticLabel} | behavior ${result.behaviorPass ? 'pass' : 'fail'}]`,
          )} ${this.truncate(result.question, 45)}`,
          0,
          0,
        ),
      );
      if (result.comment && !exactPass) {
        this.addChild(new Text(`    ${theme.muted(this.truncate(result.comment, 80))}`, 0, 0));
      }
    }

    this.addChild(new Spacer(1));
    this.addChild(new Text('─'.repeat(70), 0, 0));
    this.addChild(new Text(
      theme.muted(
        this.state.reviewPath
          ? 'Semantic scores are pending manual review.'
          : 'View full results: https://smith.langchain.com',
      ),
      0,
      0,
    ));
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
  }
}
