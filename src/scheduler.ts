export function defaultConcurrency(cores: number): number {
  return Math.min(16, Math.max(2, cores - 2))
}

type Entry = { fn: () => Promise<unknown>; res: (v: unknown) => void; rej: (e: unknown) => void }

export class Limiter {
  private active = 0
  private queue: Entry[] = []

  constructor(public readonly max: number) {
    if (!(max >= 1) || !Number.isFinite(max)) throw new Error('Limiter max must be >= 1')
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((res, rej) => {
      this.queue.push({ fn: fn as () => Promise<unknown>, res: res as (v: unknown) => void, rej })
      this.drain()
    })
  }

  private drain(): void {
    while (this.active < this.max && this.queue.length) {
      const e = this.queue.shift()!
      this.active++
      let p: Promise<unknown>
      try {
        p = e.fn()
      } catch (err) {
        this.active--
        e.rej(err)
        continue
      }
      p.then(
        (v) => { this.active--; e.res(v); this.drain() },
        (err) => { this.active--; e.rej(err); this.drain() },
      )
    }
  }
}
