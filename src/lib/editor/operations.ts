import type { Episode, Scene } from "./schemas";

export function replaceScene(episode: Episode, sceneId: string, replacement: Scene): Episode {
  const index = episode.scenes.findIndex((scene) => scene.id === sceneId);
  if (index === -1) throw new Error("Scene not found.");
  const scenes = episode.scenes.map((scene, currentIndex) =>
    currentIndex === index ? { ...replacement, id: sceneId, position: scene.position } : scene,
  );
  return { ...episode, scenes };
}

export function reorderScene(episode: Episode, sceneId: string, nextPosition: number): Episode {
  const index = episode.scenes.findIndex((scene) => scene.id === sceneId);
  if (index === -1) throw new Error("Scene not found.");
  const clamped = Math.max(0, Math.min(episode.scenes.length - 1, nextPosition));
  const scenes = [...episode.scenes];
  const [scene] = scenes.splice(index, 1);
  scenes.splice(clamped, 0, scene);
  return { ...episode, scenes: scenes.map((item, position) => ({ ...item, position })) };
}
