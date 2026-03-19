export default class WebWorkerShim extends Worker {
  constructor(url: string | URL) {
    super(url instanceof URL ? url.toString() : url, { type: 'module' })
  }
}
