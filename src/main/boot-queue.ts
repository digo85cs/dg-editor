const queue: Array<() => Promise<void> | void> = []
let running = false
let index = 0

export function enqueueBoot(fn: () => Promise<void> | void) {
  queue.push(fn)
}

export async function runBootQueue() {
  if (running) return
  running = true
  while (index < queue.length) {
    const fn = queue[index++]
    try {
      await Promise.resolve(fn())
    } catch (e) {
      console.warn('[boot-queue]', e)
    }
    await new Promise(r => setTimeout(r, 300))
  }
  running = false
}
