import { useEffect, useRef } from 'react';
import { editor, getState, useEditor } from '../state/editor';
import { saveProject } from '../io/project';
import { saveProjectUi } from '../state/project-ui';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { CanvasView } from './CanvasView';
import { StatusBar } from './StatusBar';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function EditorShell() {
  const s = useEditor();
  const { doc, projectId } = s;
  const savedDocRef = useRef(doc);
  const savedProjectRef = useRef(projectId);

  // 自动保存：改动停下 600ms 后落盘，写前由 Rust 侧做快照。
  // 打开工程时 doc 与工程 id 都是初始值，直接跳过，避免“只打开一下就多一个版本”。
  useEffect(() => {
    if (!projectId) return;
    if (savedDocRef.current === doc && savedProjectRef.current === projectId) return;
    let alive = true;
    editor.setSaveState('saving');
    const timer = window.setTimeout(() => {
      saveProject(projectId, doc)
        .then(() => {
          if (alive) {
            savedDocRef.current = doc;
            savedProjectRef.current = projectId;
            editor.setSaveState('saved');
          }
        })
        .catch(() => {
          if (alive) editor.setSaveState('error');
        });
    }, 600);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [doc, projectId]);

  // 当前页与各页视口是界面状态，不写进设计文件；按工程记在本地，重开接着用。
  useEffect(() => {
    if (!projectId) return;
    const timer = window.setTimeout(() => {
      saveProjectUi(projectId, { pageId: s.pageId, viewports: s.viewports });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [projectId, s.pageId, s.viewports]);

  useEffect(() => {
    const flush = () => {
      const current = getState();
      if (current.projectId) {
        saveProjectUi(current.projectId, { pageId: current.pageId, viewports: current.viewports });
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        if (projectId) {
          editor.setSaveState('saving');
          saveProject(projectId, doc)
            .then(() => editor.setSaveState('saved'))
            .catch(() => editor.setSaveState('error'));
        }
        return;
      }

      if (isTyping(e.target)) return;

      if (!mod && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') editor.nudgeSelected(-step, 0);
        else if (e.key === 'ArrowRight') editor.nudgeSelected(step, 0);
        else if (e.key === 'ArrowUp') editor.nudgeSelected(0, -step);
        else if (e.key === 'ArrowDown') editor.nudgeSelected(0, step);
        return;
      }

      if (mod) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) editor.redo();
          else editor.undo();
        } else if (key === 'y') {
          e.preventDefault();
          editor.redo();
        } else if (key === 'd') {
          e.preventDefault();
          editor.duplicateSelected();
        } else if (key === 'g') {
          e.preventDefault();
          if (e.shiftKey) editor.ungroupSelected();
          else editor.groupSelected();
        } else if (key === '=' || key === '+') {
          e.preventDefault();
          editor.setZoomPercent(Math.round(getState().viewport.scale * 125));
        } else if (key === '-') {
          e.preventDefault();
          editor.setZoomPercent(Math.round(getState().viewport.scale * 80));
        } else if (key === '0') {
          e.preventDefault();
          editor.setZoomPercent(100);
        }
        return;
      }

      if (e.shiftKey) {
        if (e.code === 'Digit0') {
          e.preventDefault();
          editor.setZoomPercent(100);
        } else if (e.code === 'Digit1' || e.code === 'Digit2') {
          e.preventDefault();
          if (e.code === 'Digit2') editor.fitSelection();
          else editor.fitAll();
        }
        return;
      }

      if (key === 'v') editor.setTool('move');
      else if (key === 'f') editor.setTool('frame');
      else if (key === 's') editor.setTool('section');
      else if (key === 'r') editor.setTool('rect');
      else if (key === 'o') editor.setTool('ellipse');
      else if (key === 'l') editor.setTool('line');
      else if (key === 'a') editor.setTool('arrow');
      else if (key === 'g') editor.setTool('polygon');
      else if (key === 'y') editor.setTool('star');
      else if (key === 'p') editor.setTool('pen');
      else if (key === 'k') editor.setTool('slice');
      else if (key === 't') editor.setTool('text');
      else if (key === 'h') editor.setTool('hand');
      else if (e.key === 'Escape') editor.clearSelection();
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        editor.deleteSelected();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, projectId]);

  return (
    <div className="editor">
      <TopBar />
      <div className="editor-body">
        <LeftPanel />
        <main className="canvas-area">
          <CanvasView />
        </main>
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}
