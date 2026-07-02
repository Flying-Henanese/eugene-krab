import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGatewayConfig, resolveFeishuAccount, resolveGatewayAgentModel } from './config.js';

describe('gateway config', () => {
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
