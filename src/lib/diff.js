/**
 * Flags regressions between two runs of the same suite: status-code changes,
 * a step flipping pass/fail, or a meaningful latency jump. Pure function of
 * two report objects - the browser can run this against localStorage history
 * without any server involvement.
 */
export function diffRuns(previous, current, latencyThresholdMs = 200) {
  const previousById = new Map(previous.results.map(result => [result.step.id, result]))
  const changes = []

  for (const currentResult of current.results) {
    const before = previousById.get(currentResult.step.id)
    if (!before) continue

    const change = { stepId: currentResult.step.id, title: currentResult.step.title }
    let changed = false

    if (before.status !== currentResult.status) {
      change.statusChanged = { from: before.status, to: currentResult.status }
      changed = true
    }

    const durationDelta = currentResult.duration - before.duration
    if (Math.abs(durationDelta) >= latencyThresholdMs) {
      change.durationDelta = durationDelta
      changed = true
    }

    if (before.ok && !currentResult.ok) {
      change.newlyFailing = true
      changed = true
    } else if (!before.ok && currentResult.ok) {
      change.newlyPassing = true
      changed = true
    }

    if (changed) changes.push(change)
  }

  return { previousRunAt: previous.finishedAt, changes }
}
