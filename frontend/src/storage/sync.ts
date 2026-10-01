/**
 * Multi-tab synchronization using BroadcastChannel.
 * Prevents tab collisions, detects active level locks, and coordinates state updates.
 */

export interface TabSyncMessage {
  type: 'PROGRESS_UPDATED' | 'LEVEL_LOCKED' | 'LEVEL_TAKEOVER' | 'PING' | 'PONG'
  senderTabId: string
  levelId?: number | 'free'
  timestamp: number
}

export class TabSyncManager {
  private channel: BroadcastChannel | null = null
  private tabId: string
  private activeLevelId: number | 'free' | null = null
  private collisionListeners: Array<(collidingTabId: string) => void> = []
  private progressUpdateListeners: Array<() => void> = []
  private isLevelOpenInOtherTab = false

  constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('sudoku_sync_channel')
        this.channel.onmessage = (event: MessageEvent<TabSyncMessage>) => {
          this.handleMessage(event.data)
        }
      } catch (err) {
        console.warn('BroadcastChannel not available in this environment:', err)
      }
    }
  }

  public get currentTabId(): string {
    return this.tabId
  }

  public get isLockedByOtherTab(): boolean {
    return this.isLevelOpenInOtherTab
  }

  public onCollision(listener: (collidingTabId: string) => void): () => void {
    this.collisionListeners.push(listener)
    return () => {
      this.collisionListeners = this.collisionListeners.filter((l) => l !== listener)
    }
  }

  public onProgressUpdate(listener: () => void): () => void {
    this.progressUpdateListeners.push(listener)
    return () => {
      this.progressUpdateListeners = this.progressUpdateListeners.filter((l) => l !== listener)
    }
  }

  public lockLevel(levelId: number | 'free'): void {
    this.activeLevelId = levelId
    this.isLevelOpenInOtherTab = false
    this.postMessage({
      type: 'LEVEL_LOCKED',
      senderTabId: this.tabId,
      levelId,
      timestamp: Date.now(),
    })
  }

  public unlockLevel(): void {
    this.activeLevelId = null
    this.isLevelOpenInOtherTab = false
  }

  public takeOverLevel(levelId: number | 'free'): void {
    this.activeLevelId = levelId
    this.isLevelOpenInOtherTab = false
    this.postMessage({
      type: 'LEVEL_TAKEOVER',
      senderTabId: this.tabId,
      levelId,
      timestamp: Date.now(),
    })
  }

  public broadcastProgressUpdated(): void {
    this.postMessage({
      type: 'PROGRESS_UPDATED',
      senderTabId: this.tabId,
      timestamp: Date.now(),
    })
  }

  private postMessage(msg: TabSyncMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(msg)
      } catch (e) {
        console.warn('Failed to broadcast message:', e)
      }
    }
  }

  private handleMessage(msg: TabSyncMessage): void {
    if (msg.senderTabId === this.tabId) return

    switch (msg.type) {
      case 'LEVEL_LOCKED':
        if (this.activeLevelId !== null && this.activeLevelId === msg.levelId) {
          // Collision: another tab just opened the same level
          this.isLevelOpenInOtherTab = true
          for (const l of this.collisionListeners) {
            l(msg.senderTabId)
          }
        }
        break

      case 'LEVEL_TAKEOVER':
        if (this.activeLevelId !== null && this.activeLevelId === msg.levelId) {
          // Another tab took over this level!
          this.isLevelOpenInOtherTab = true
          for (const l of this.collisionListeners) {
            l(msg.senderTabId)
          }
        }
        break

      case 'PROGRESS_UPDATED':
        for (const l of this.progressUpdateListeners) {
          l()
        }
        break
    }
  }
}

export const tabSync = new TabSyncManager()
