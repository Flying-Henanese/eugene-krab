import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGatewayConfig, resolveFeishuAccount, resolveGatewayAgentModel } from './config.js';

describe('gateway config', () => {
  test('initializes the default gateway config from the root example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const previousCwd = process.cwd();
    const example = {
      channels: {
        feishu: {
          enabled: true,
          processingCard: { enabled: true, text: '正在分析中，请稍候…' },
        },
      },
    };
    writeFileSync(join(dir, 'gateway.example.json'), JSON.stringify(example), 'utf8');

    try {
      process.chdir(dir);
      const cfg = loadGatewayConfig();

      expect(cfg.channels.whatsapp.enabled).toBe(true);
      expect(cfg.channels.feishu.enabled).toBe(true);
      expect(cfg.channels.feishu.processingCard.enabled).toBe(true);
      expect(existsSync(join(dir, '.dexter', 'gateway.json'))).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, '.dexter', 'gateway.json'), 'utf8'))).toEqual(example);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not overwrite an existing default gateway config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const previousCwd = process.cwd();
    const existing = { channels: { feishu: { enabled: false } } };
    mkdirSync(join(dir, '.dexter'), { recursive: true });
    writeFileSync(join(dir, '.dexter', 'gateway.json'), JSON.stringify(existing), 'utf8');
    writeFileSync(
      join(dir, 'gateway.example.json'),
      JSON.stringify({ channels: { feishu: { enabled: true } } }),
      'utf8',
    );

    try {
      process.chdir(dir);
      expect(loadGatewayConfig().channels.feishu.enabled).toBe(false);
      expect(JSON.parse(readFileSync(join(dir, '.dexter', 'gateway.json'), 'utf8'))).toEqual(existing);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('defaults Feishu to disabled when config file is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const path = join(dir, 'missing.json');
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldSecret = process.env.FEISHU_APP_SECRET;
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    try {
      const cfg = loadGatewayConfig(path);
      expect(cfg.channels.feishu.enabled).toBe(false);
      expect(cfg.channels.feishu.processingCard).toEqual({
        enabled: false,
        text: '正在分析中，请稍候…',
      });
      expect(resolveFeishuAccount(cfg, 'default')).toEqual({
        accountId: 'default',
        enabled: false,
        appId: undefined,
        appSecret: undefined,
      });
    } finally {
      if (oldAppId === undefined) delete process.env.FEISHU_APP_ID;
      else process.env.FEISHU_APP_ID = oldAppId;
      if (oldSecret === undefined) delete process.env.FEISHU_APP_SECRET;
      else process.env.FEISHU_APP_SECRET = oldSecret;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('parses Feishu processing card defaults and custom text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const path = join(dir, 'gateway.json');
    try {
      writeFileSync(
        path,
        JSON.stringify({ channels: { feishu: { enabled: true, processingCard: { enabled: true } } } }),
        'utf8',
      );
      expect(loadGatewayConfig(path).channels.feishu.processingCard).toEqual({
        enabled: true,
        text: '正在分析中，请稍候…',
      });

      writeFileSync(
        path,
        JSON.stringify({ channels: { feishu: { processingCard: { enabled: true, text: '正在整理财报…' } } } }),
        'utf8',
      );
      expect(loadGatewayConfig(path).channels.feishu.processingCard.text).toBe('正在整理财报…');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('falls back for blank Feishu processing text and rejects non-string text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const path = join(dir, 'gateway.json');
    try {
      writeFileSync(
        path,
        JSON.stringify({ channels: { feishu: { processingCard: { text: '   ' } } } }),
        'utf8',
      );
      expect(loadGatewayConfig(path).channels.feishu.processingCard.text).toBe('正在分析中，请稍候…');

      writeFileSync(
        path,
        JSON.stringify({ channels: { feishu: { processingCard: { text: 123 } } } }),
        'utf8',
      );
      expect(() => loadGatewayConfig(path)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reads Feishu credentials from environment only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const path = join(dir, 'gateway.json');
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldSecret = process.env.FEISHU_APP_SECRET;
    process.env.FEISHU_APP_ID = 'cli_test';
    process.env.FEISHU_APP_SECRET = 'secret_test';
    try {
      writeFileSync(path, JSON.stringify({ channels: { feishu: { enabled: true } } }), 'utf8');
      const cfg = loadGatewayConfig(path);
      expect(cfg.channels.feishu.enabled).toBe(true);
      expect(resolveFeishuAccount(cfg, 'default')).toEqual({
        accountId: 'default',
        enabled: true,
        appId: 'cli_test',
        appSecret: 'secret_test',
      });
    } finally {
      if (oldAppId === undefined) delete process.env.FEISHU_APP_ID;
      else process.env.FEISHU_APP_ID = oldAppId;
      if (oldSecret === undefined) delete process.env.FEISHU_APP_SECRET;
      else process.env.FEISHU_APP_SECRET = oldSecret;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('resolves gateway agent model from env before settings fallback', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const path = join(dir, 'missing.json');
    const oldModel = process.env.DEXTER_AGENT_MODEL;
    const oldProvider = process.env.DEXTER_AGENT_MODEL_PROVIDER;
    process.env.DEXTER_AGENT_MODEL = 'deepseek-v4-pro';
    process.env.DEXTER_AGENT_MODEL_PROVIDER = 'deepseek';
    try {
      const cfg = loadGatewayConfig(path);
      expect(resolveGatewayAgentModel(cfg)).toEqual({
        model: 'deepseek-v4-pro',
        modelProvider: 'deepseek',
      });
    } finally {
      if (oldModel === undefined) delete process.env.DEXTER_AGENT_MODEL;
      else process.env.DEXTER_AGENT_MODEL = oldModel;
      if (oldProvider === undefined) delete process.env.DEXTER_AGENT_MODEL_PROVIDER;
      else process.env.DEXTER_AGENT_MODEL_PROVIDER = oldProvider;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('resolves gateway agent model from gateway config before env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
    const path = join(dir, 'gateway.json');
    const oldModel = process.env.DEXTER_AGENT_MODEL;
    const oldProvider = process.env.DEXTER_AGENT_MODEL_PROVIDER;
    process.env.DEXTER_AGENT_MODEL = 'deepseek-v4-flash';
    process.env.DEXTER_AGENT_MODEL_PROVIDER = 'deepseek';
    try {
      writeFileSync(
        path,
        JSON.stringify({
          gateway: {
            model: 'deepseek-v4-pro',
            modelProvider: 'deepseek',
          },
        }),
        'utf8',
      );
      const cfg = loadGatewayConfig(path);
      expect(resolveGatewayAgentModel(cfg)).toEqual({
        model: 'deepseek-v4-pro',
        modelProvider: 'deepseek',
      });
    } finally {
      if (oldModel === undefined) delete process.env.DEXTER_AGENT_MODEL;
      else process.env.DEXTER_AGENT_MODEL = oldModel;
      if (oldProvider === undefined) delete process.env.DEXTER_AGENT_MODEL_PROVIDER;
      else process.env.DEXTER_AGENT_MODEL_PROVIDER = oldProvider;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
