export type AutomationBannerProps = {
  macroName: string;
  intervalMs: number;
  droppedAutomatedSends: number;
  onStopAll: () => void;
};

export function AutomationBanner({
  macroName,
  intervalMs,
  droppedAutomatedSends,
  onStopAll
}: AutomationBannerProps) {
  return (
    <section className="automation-banner" aria-label="Automation running">
      <span>{macroName}</span>
      <span>{intervalMs} ms</span>
      <span>Dropped {droppedAutomatedSends}</span>
      <button type="button" onClick={onStopAll}>
        Stop all
      </button>
    </section>
  );
}
