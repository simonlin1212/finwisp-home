// Fail closed if a Worker is accidentally constructed without explicit storage.
export class FileCache { constructor() { throw new Error('Workers require an explicit cache adapter'); } }
export class FileProfileStorage { constructor() { throw new Error('Workers require an explicit profile storage adapter'); } }
