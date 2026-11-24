import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Splash } from './ui/Splash';
import { Welcome } from './ui/Welcome';
import { EditorShell } from './ui/EditorShell';
import { editor } from './state/editor';
import { createProject, isDesktop, listProjects, loadProject, type ProjectEntry } from './io/project';
import { hydrateDocImages, importImageAsset, setImageProject } from './io/images';
import { parseSvgDrawing } from './io/importSvg';
import { applySvgImport } from './io/applySvgImport';
import { loadProjectUi } from './state/project-ui';

type Phase = 'splash' | 'welcome' | 'editor';

interface LaunchInfo {
  mode: 'new' | 'open' | 'welcome' | 'importImage';
  projectId?: string;
  /** Strata 送来的图片路径（后端带 --import-image 解析）。 */
  files?: string[];
}

interface HandoffImage {
  name: string;
  mime: string;
  base64: string;
  bytes: number;
}

async function readLaunchMode(): Promise<LaunchInfo> {
  try {
    return await invoke<LaunchInfo>('launch_mode');
  } catch {
    return { mode: 'welcome' };
  }
}

export interface NewDesignOptions {
  width?: number;
  height?: number;
  frameName?: string;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const creating = useRef(false);

  const refreshProjects = useCallback(async () => {
    if (!isDesktop()) {
      setLoading(false);
      return;
    }
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (err) {
      setError(`读取本地工程失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const onCreate = useCallback(async (options?: NewDesignOptions) => {
    if (creating.current) return;
    creating.current = true;
    editor.newDoc('未命名设计', options?.width, options?.height, options?.frameName);
    setPhase('editor');
    try {
      const id = await createProject('未命名设计');
      editor.setProjectId(id);
      setImageProject(id);
    } catch {
      editor.setProjectId(null);
      setImageProject(null);
    } finally {
      creating.current = false;
    }
  }, []);

  const onImportSvg = useCallback(async (file: File) => {
    if (creating.current) return;
    creating.current = true;
    setError(null);
    try {
      const text = await file.text();
      const name = file.name.replace(/\.svg$/i, '') || '导入图形';
      const parsed = parseSvgDrawing(text, name);
      if (parsed.frames.every((frame) => frame.children.length === 0)) {
        throw new Error('SVG 里没有可导入的图形');
      }
      editor.newDoc(name, 1440, 900, undefined, false);
      setPhase('editor');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      let id: string | null = null;
      try {
        id = await createProject(name);
        editor.setProjectId(id);
        setImageProject(id);
      } catch {
        editor.setProjectId(null);
        setImageProject(null);
      }
      const result = await applySvgImport(parsed, id);
      if (result.warnings.length > 0) {
        setError(result.warnings.join(' · '));
      }
      void refreshProjects();
    } catch (err) {
      setError(`导入失败：${err instanceof Error ? err.message : String(err)}`);
      setPhase('welcome');
    } finally {
      creating.current = false;
    }
  }, [refreshProjects]);

  /**
   * 接收 Strata 送来的成图：路径由 Rust 侧从 --import-image 解析，
   * 这里读字节、构造 File，然后完全复用顶栏「导入图片」那条链路
   * （资产写进 <工程>/assets，节点是可编辑的 image，不是临时预览）。
   */
  const onImportHandoff = useCallback(
    async (paths: string[]) => {
      if (creating.current || paths.length === 0) return;
      creating.current = true;
      setError(null);
      try {
        const first = paths[0].split(/[\\/]/).pop() || 'Strata 图片';
        const name = first.replace(/\.(png|jpe?g|webp)$/i, '') || 'Strata 图片';
        editor.newDoc(name, 1440, 900, undefined, false);
        setPhase('editor');
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        let id: string | null = null;
        try {
          id = await createProject(name);
          editor.setProjectId(id);
          setImageProject(id);
        } catch {
          editor.setProjectId(null);
          setImageProject(null);
          throw new Error('创建工程失败，图片无法写入资产');
        }

        let count = 0;
        for (const path of paths) {
          const raw = await invoke<HandoffImage>('groma_read_handoff_image', { path });
          const dataUrl = `data:${raw.mime};base64,${raw.base64}`;
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], raw.name, { type: raw.mime });
          const { asset } = await importImageAsset(id, file);
          editor.insertImage(asset, { x: 120 + count * 32, y: 96 + count * 32 });
          count += 1;
        }
        void refreshProjects();
      } catch (err) {
        setError(`导入 Strata 图片失败：${err instanceof Error ? err.message : String(err)}`);
        setPhase('welcome');
      } finally {
        creating.current = false;
      }
    },
    [refreshProjects],
  );

  const onOpen = useCallback(async (id: string) => {
    setError(null);
    try {
      const doc = await loadProject(id);
      editor.loadDoc(doc, id, loadProjectUi(id));
      setImageProject(id);
      void hydrateDocImages(doc, id);
      setPhase('editor');
    } catch (err) {
      setError(`打开工程失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    const minSplash = 760;

    readLaunchMode().then((info) => {
      const wait = Math.max(0, minSplash - (Date.now() - started));
      window.setTimeout(() => {
        if (!alive) return;
        if (info.mode === 'importImage' && info.files?.length) {
          void onImportHandoff(info.files);
        } else if (info.mode === 'new') {
          void onCreate();
        } else if (info.mode === 'open' && info.projectId) {
          const id = info.projectId;
          loadProject(id)
            .then((doc) => {
              if (!alive) return;
              editor.loadDoc(doc, id, loadProjectUi(id));
              setImageProject(id);
              void hydrateDocImages(doc, id);
              setPhase('editor');
            })
            .catch((err) => {
              if (!alive) return;
              setError(`打开工程失败：${err instanceof Error ? err.message : String(err)}`);
              setPhase('welcome');
            });
        } else {
          setPhase('welcome');
        }
      }, wait);
    });

    return () => {
      alive = false;
    };
  }, [onCreate, onImportHandoff]);

  if (phase === 'splash') return <Splash />;
  if (phase === 'welcome') {
    return (
      <Welcome
        onCreate={onCreate}
        onOpen={onOpen}
        onImportSvg={onImportSvg}
        projects={projects}
        loading={loading}
        error={error}
      />
    );
  }
  return <EditorShell />;
}
