export function Splash() {
  return (
    <div className="splash">
      <div className="splash-halo" aria-hidden="true" />
      <div className="splash-brand">
        <img className="splash-icon" src="/groma-icon.png" alt="" draggable={false} />
        <div className="splash-name">Groma</div>
        <div className="splash-sub">界面设计工作台</div>
      </div>
      <div className="splash-progress" aria-hidden="true">
        <span />
      </div>
      <div className="splash-foot">小方工作室 · 本地优先</div>
    </div>
  );
}
