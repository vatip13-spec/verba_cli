'use strict';

const { execFile, spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { delimiter, join } = require('node:path');
const { createInterface } = require('node:readline');
const { failure } = require('./provider.cjs');

const GPT_MODEL = /^gpt-[a-z0-9][a-z0-9._-]{0,79}$/i;
const EFFORT = /^[a-z][a-z0-9_-]{0,23}$/;
const TRANSLATION_TIMEOUT = 180000;

function executable() {
    if (process.env.VERBA_CODEX_EXECUTABLE) return [process.env.VERBA_CODEX_EXECUTABLE, []];
    if (process.platform !== 'win32') return ['codex', []];
    for (const part of (process.env.PATH || '').split(delimiter)) {
        const directory = part.trim().replace(/^"|"$/g, '');
        if (!directory) continue;
        const native = join(directory, 'codex.exe');
        if (existsSync(native)) return [native, []];
        const npm = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
        if (existsSync(npm)) return [process.execPath, [npm]];
    }
    return ['codex.exe', []];
}

function processError(error) {
    if (error?.name === 'AbortError' || error?.status) return error;
    if (error?.code === 'ENOENT') return failure(503, '실리태번 서버에서 Codex CLI를 찾을 수 없습니다.');
    if (error?.killed) return failure(504, 'Codex CLI 응답 대기 시간을 초과했습니다.');
    return failure(502, 'Codex CLI 요청에 실패했습니다. 서버를 실행한 계정의 Codex 로그인과 모델을 확인해 주세요.');
}

async function withTempDirectory(operation) {
    const directory = await mkdtemp(join(tmpdir(), 'verba-codex-'));
    try {
        return await operation(directory);
    } catch (error) {
        throw processError(error);
    } finally {
        await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
}

async function translateCodex(prompt, config = {}, { signal } = {}) {
    const { model = '', reasoning = '' } = config;
    if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt) > 4 * 1024 * 1024
        || typeof model !== 'string' || (model && !GPT_MODEL.test(model))
        || typeof reasoning !== 'string' || (reasoning && !EFFORT.test(reasoning))) {
        throw failure(400, 'Codex CLI 번역 요청이나 모델·리즈닝 설정을 확인해 주세요.');
    }
    signal?.throwIfAborted();
    return withTempDirectory(async cwd => {
        const [command, prefix] = executable();
        const args = [
            '--ask-for-approval', 'never', '--disable', 'shell_tool',
            '-c', 'web_search="disabled"',
            'exec', '--sandbox', 'read-only', '--skip-git-repo-check',
            '--ephemeral', '--ignore-user-config', '--color', 'never',
        ];
        if (model) args.push('--model', model);
        if (reasoning) args.push('-c', `model_reasoning_effort=${JSON.stringify(reasoning)}`);
        args.push('-');
        const content = await new Promise((resolve, reject) => {
            const child = execFile(command, [...prefix, ...args], {
                cwd, signal, timeout: TRANSLATION_TIMEOUT, maxBuffer: 4 * 1024 * 1024,
                encoding: 'utf8', windowsHide: true, shell: false,
            }, (error, stdout) => error ? reject(error) : resolve(stdout));
            child.stdin.on('error', () => {}); // execFile reports the process error.
            child.stdin.end(prompt, 'utf8');
        });
        if (!content.trim()) throw failure(502, 'Codex CLI가 빈 응답을 반환했습니다.');
        return { content };
    });
}

function listCodexModels(signal) {
    signal?.throwIfAborted();
    return withTempDirectory(cwd => new Promise((resolve, reject) => {
        const [command, prefix] = executable();
        const child = spawn(command, [...prefix, 'app-server'], {
            cwd, signal, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'],
        });
        const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
        const models = new Map();
        const cursors = new Set();
        let settled = false;
        const send = value => child.stdin.write(JSON.stringify(value) + '\n');
        const timeout = setTimeout(() => finish(failure(504, 'Codex CLI 모델 목록을 불러오는 시간이 초과됐습니다.')), 15000);
        function finish(error) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            lines.close();
            child.stdin.end();
            child.kill();
            if (error) reject(error);
            else resolve({ models: [...models.values()] });
        }
        child.once('error', finish);
        child.once('close', () => finish(failure(502, 'Codex CLI 모델 목록을 불러올 수 없습니다.')));
        child.stdin.on('error', () => {}); // The process close or timeout handles termination.
        lines.on('line', line => {
            let reply;
            try { reply = JSON.parse(line); } catch { return; }
            if (reply?.id !== 1 && reply?.id !== 2) return;
            if (reply.error) {
                finish(failure(502, 'Codex CLI 모델 목록을 불러올 수 없습니다. CLI 버전과 로그인을 확인해 주세요.'));
                return;
            }
            if (reply.id === 1) {
                send({ method: 'initialized' });
                send({ id: 2, method: 'model/list', params: { includeHidden: false } });
                return;
            }
            if (!Array.isArray(reply.result?.data)) {
                finish(failure(502, 'Codex CLI 모델 목록 형식이 올바르지 않습니다.'));
                return;
            }
            for (const entry of reply.result.data) {
                const id = entry?.model || entry?.id;
                if (typeof id !== 'string' || !GPT_MODEL.test(id) || entry.hidden) continue;
                const efforts = Array.isArray(entry.supportedReasoningEfforts) ? entry.supportedReasoningEfforts : [];
                models.set(id, {
                    id,
                    isDefault: entry.isDefault === true,
                    efforts: [...new Set(efforts.map(item => item?.reasoningEffort).filter(value => typeof value === 'string' && EFFORT.test(value)))],
                });
            }
            const cursor = reply.result.nextCursor;
            if (typeof cursor === 'string' && cursor && !cursors.has(cursor)) {
                cursors.add(cursor);
                send({ id: 2, method: 'model/list', params: { includeHidden: false, cursor } });
            } else {
                finish();
            }
        });
        send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'verba_cli', title: 'Verba CLI', version: '0.1.0' } } });
    }));
}

function mountCodexRoutes(router, owner, route) {
    function withAbort(handler) {
        return (req, res) => {
            const controller = new AbortController();
            res.once('close', () => { if (!res.writableEnded) controller.abort(); });
            return route(request => {
                owner(request);
                return handler(request, controller.signal);
            })(req, res);
        };
    }
    router.get('/codex/models', withAbort((_req, signal) => listCodexModels(signal)));
    router.post('/codex/translate', withAbort((req, signal) => translateCodex(req.body?.prompt, {
        model: req.body?.model,
        reasoning: req.body?.reasoning,
    }, { signal })));
}

module.exports = { mountCodexRoutes, translateCodex };
