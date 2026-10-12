// Per-turn measurements for every model call. Stored with the turn job and the
// committed event for the developer console; never streamed to the player
// because validation errors may name hidden fact IDs.

const now = () => Date.now();

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
}

function addUsage(target, usage) {
  if (!usage) return;
  target.input += usage.input ?? 0;
  target.output += usage.output ?? 0;
  target.cacheRead += usage.cacheRead ?? 0;
  target.cacheWrite += usage.cacheWrite ?? 0;
  target.totalTokens += usage.totalTokens ?? 0;
  target.cost += usage.cost?.total ?? 0;
}

export class TurnTelemetry {
  constructor(config = null, startedAt = now()) {
    this.version = 1;
    this.config = config;
    this.startedAt = startedAt;
    this.marks = {};
    this.calls = [];
    this.quality = { issues: [] };
    this.record = null;
  }

  static from(snapshot, config = null) {
    const telemetry = new TurnTelemetry(snapshot?.config ?? config, snapshot?.startedAt ?? now());
    if (!snapshot) return telemetry;
    telemetry.marks = { ...snapshot.marks };
    telemetry.calls = structuredClone(snapshot.calls ?? []);
    telemetry.quality = structuredClone(snapshot.quality ?? { issues: [] });
    telemetry.record = snapshot.record ? structuredClone(snapshot.record) : null;
    return telemetry;
  }

  mark(name) {
    this.marks[name] ??= now() - this.startedAt;
  }

  begin(role, phase, promptChars = 0) {
    const call = {
      role,
      phase,
      startedAtMs: now() - this.startedAt,
      durationMs: null,
      firstTokenMs: null,
      promptChars,
      assistantMessages: 0,
      toolFailures: 0,
      autoRetries: 0,
      validationErrors: [],
      usage: emptyUsage(),
      model: null,
      stopReason: null,
      outcome: 'running',
      _started: now(),
    };
    this.calls.push(call);
    return call;
  }

  attach(session, call) {
    if (!session?.subscribe) return () => {};
    return session.subscribe((event) => {
      if (event.type === 'message_update' && call.firstTokenMs === null) {
        const type = event.assistantMessageEvent?.type;
        if (type === 'text_delta' || type === 'toolcall_delta' || type === 'thinking_delta') call.firstTokenMs = now() - call._started;
      }
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        call.assistantMessages += 1;
        addUsage(call.usage, event.message.usage);
        call.model = event.message.responseModel ?? event.message.model ?? call.model;
        call.stopReason = event.message.stopReason ?? call.stopReason;
      }
      if (event.type === 'auto_retry_start') call.autoRetries += 1;
    });
  }

  recordFailure(call, message) {
    call.toolFailures += 1;
    if (call.validationErrors.length < 6) call.validationErrors.push(String(message ?? '').slice(0, 200));
  }

  end(call, outcome = 'ok', error = null) {
    if (!call || call.durationMs !== null) return;
    call.durationMs = now() - call._started;
    call.outcome = outcome;
    if (error) call.error = String(error.message ?? error).slice(0, 300);
  }

  addQualityIssues(issues = []) {
    this.quality.issues.push(...issues);
  }

  totals() {
    const usage = emptyUsage();
    for (const call of this.calls) {
      usage.input += call.usage.input;
      usage.output += call.usage.output;
      usage.cacheRead += call.usage.cacheRead;
      usage.cacheWrite += call.usage.cacheWrite;
      usage.totalTokens += call.usage.totalTokens;
      usage.cost += call.usage.cost;
    }
    return {
      usage,
      calls: this.calls.length,
      toolFailures: this.calls.reduce((sum, call) => sum + call.toolFailures, 0),
      autoRetries: this.calls.reduce((sum, call) => sum + call.autoRetries, 0),
    };
  }

  toJSON() {
    return {
      version: this.version,
      config: this.config,
      startedAt: new Date(this.startedAt).toISOString(),
      marks: { ...this.marks },
      totalMs: this.marks.completed ?? this.marks.committed ?? null,
      calls: this.calls.map(({ _started, ...call }) => structuredClone(call)),
      totals: this.totals(),
      quality: structuredClone(this.quality),
      record: this.record ? structuredClone(this.record) : null,
    };
  }
}
