import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Splash } from './ui/Splash';
import { Welcome } from './ui/Welcome';
import { EditorShell } from './ui/EditorShell';
import { editor } from './state/editor';
import { createProject, isDesktop, listProjects, loadProject, type ProjectEntry } from './io/project';
import { loadProjectUi } from './state/project-ui';

type Phase = 'splash' | 'welcome' | 'editor';

interface LaunchInfo {
  mode: 'new' | 'open' | 'welcome';
  projectId?: string;
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
    } catch {
      editor.setProjectId(null);
    } finally {
      creating.current = false;
    }
  }, []);

  const onOpen = useCallback(async (id: string) => {
    setError(null);
    try {
      const doc = await loadProject(id);
      editor.loadDoc(doc, id, loadProjectUi(id));
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
        if (info.mode === 'new') {
          void onCreate();
        } else if (info.mode === 'open' && info.projectId) {
          const id = info.projectId;
          loadProject(id)
            .then((doc) => {
              if (!alive) return;
              editor.loadDoc(doc, id, loadProjectUi(id));
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
  }, [onCreate]);

  if (phase === 'splash') return <Splash />;
  if (phase === 'welcome') {
    return (
      <Welcome
        onCreate={onCreate}
        onOpen={onOpen}
        projects={projects}
        loading={loading}
        error={error}
      />
    );
  }
  return <EditorShell />;
}
