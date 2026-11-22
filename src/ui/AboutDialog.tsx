interface Props {
  onClose: () => void;
}

export function AboutDialog({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="关于 Groma">
        <div className="about-head">
          <img src="/groma-icon.png" alt="" draggable={false} />
          <div>
            <div className="about-name">Groma</div>
            <div className="about-ver">版本 0.1.0 · 小方工作室</div>
          </div>
        </div>
        <p className="about-desc">本地优先的矢量界面设计工具。没有账号，没有云端，没有「稍后开放」。</p>
        <dl className="about-facts">
          <div><dt>技术底座</dt><dd>Tauri 2 · React 19 · TypeScript</dd></div>
          <div><dt>工程格式</dt><dd>.groma 目录工程</dd></div>
          <div><dt>开源许可</dt><dd>MIT</dd></div>
        </dl>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
