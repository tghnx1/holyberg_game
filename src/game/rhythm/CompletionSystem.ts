export function shouldCompleteTrack(audioEnded: boolean, allNotesJudged: boolean): boolean {
  return audioEnded && allNotesJudged;
}

export class CompletionGate {
  private completed = false;
  tryComplete(ready: boolean, callback: () => void): boolean {
    if (!ready || this.completed) return false;
    this.completed = true;
    callback();
    return true;
  }
}
