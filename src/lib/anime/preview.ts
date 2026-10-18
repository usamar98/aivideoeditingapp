/** Browser-only prototype data. These examples are not AI-generated from a user's brief. */
export type AnimeMode = "clip" | "episode";
export type AnimeStyle = "cinematic" | "watercolor" | "manga";
export type AnimeFormat = "16:9" | "9:16" | "1:1";
export type AnimeSection = "story" | "characters" | "locations" | "storyboard" | "sound" | "export";

export const animeStyles = [
  { id: "cinematic", name: "Cinematic anime", detail: "Neon light · expressive frames" },
  { id: "watercolor", name: "Watercolor fantasy", detail: "Soft light · painted worlds" },
  { id: "manga", name: "Ink & manga", detail: "Bold lines · graphic contrast" },
] as const;

export type AnimeBrief = {
  mode: AnimeMode; title: string; prompt: string; style: AnimeStyle;
  format: AnimeFormat; targetSeconds: number; language: string;
};
export type AnimeCharacter = { id: string; name: string; role: string; description: string; locked: boolean; voice: string };
export type AnimeLocation = { id: string; name: string; description: string; art: "city" | "bridge" | "station" };
export type AnimeShot = {
  id: string; title: string; seconds: number; description: string; dialogue: string;
  camera: string; locationId: string; characterId: string;
};
export type AnimePreview = {
  source: "static-sample"; brief: AnimeBrief; characters: AnimeCharacter[];
  locations: AnimeLocation[]; shots: AnimeShot[]; nextShotId: number;
  narration: boolean; music: string;
};

export const defaultAnimeBrief: AnimeBrief = {
  mode: "episode", title: "The last train home", style: "cinematic", format: "16:9", targetSeconds: 30, language: "English",
  prompt: "A young courier crosses a rain-lit city to return a lost star to its owner before the last train leaves. An old station keeper offers one unexpected clue. A quiet, hopeful ending.",
};

export const sampleStoryBeats = [
  { label: "The discovery", text: "A courier finds a small light inside an envelope. Somewhere across the city, the last train is about to leave." },
  { label: "The crossing", text: "The courier follows the light over a narrow bridge. A station keeper recognizes the envelope and points toward the platform." },
  { label: "The return", text: "The light finds its way back to a waiting traveler. The city grows quiet as the train disappears into the night." },
];

export const MAX_ANIME_SHOTS = 12;

export function createAnimePreview(brief: AnimeBrief = defaultAnimeBrief): AnimePreview {
  const count = brief.mode === "clip" ? 3 : 6;
  const target = Math.min(brief.mode === "clip" ? 15 : 180, Math.max(count, Math.round(brief.targetSeconds) || 30));
  const base = Math.floor(target / count);
  const shotData = [
    ["A city after the rain", "An establishing view of the rain-lit skyline. The station clock glows beyond the rooftops.", "", "Slow push in", "city", "mira"],
    ["A light in the envelope", "Mira lifts the envelope. A tiny light illuminates her face and the edge of her coat.", "Someone is waiting for you.", "Close-up", "city", "mira"],
    ["Across the bridge", "Mira crosses the footbridge. The glow reflects along the railing and leads toward the station.", "", "Tracking shot", "bridge", "mira"],
    ["The keeper's clue", "At the station entrance, Ari recognizes the envelope and gestures toward the final platform.", "You still have time.", "Medium shot", "station", "ari"],
    ["The last platform", "Mira steps onto the platform. The small light rises from the envelope toward a waiting traveler.", "I think this belongs to you.", "Slow push in", "station", "mira"],
    ["A softer kind of goodbye", "The last train slips past the skyline. The city lights settle into a quiet, hopeful glow.", "", "Wide shot", "bridge", "mira"],
  ];
  return {
    source: "static-sample", brief: { ...brief, targetSeconds: target }, nextShotId: count + 1,
    characters: [
      { id: "mira", name: "Mira", role: "The courier", description: "Short dark hair, ivory raincoat, small blue shoulder bag. Observant, determined, and gentle with the envelope.", locked: true, voice: "Warm / youthful" },
      { id: "ari", name: "Ari", role: "The station keeper", description: "Silver hair, a navy station uniform, round glasses, and an old brass pocket watch. Calm and quietly reassuring.", locked: true, voice: "Calm / mature" },
    ],
    locations: [
      { id: "city", name: "Rain-lit city", description: "Blue rooftops, warm window lights, wet pavement, and a distant station clock. Late evening, just after rain.", art: "city" },
      { id: "bridge", name: "The footbridge", description: "A narrow pedestrian bridge above a quiet canal. Glowing rails, city lights in the water, the station ahead.", art: "bridge" },
      { id: "station", name: "The final platform", description: "An old covered platform with amber lamps, a blue train, and a clock approaching midnight.", art: "station" },
    ],
    shots: shotData.slice(0, count).map(([title, description, dialogue, camera, locationId, characterId], i) => ({
      id: `shot-${i + 1}`, title, description, dialogue, camera, locationId, characterId,
      seconds: base + (i < target % count ? 1 : 0),
    })), narration: false, music: "Soft cinematic",
  };
}

export type AnimePreviewAction =
  | { type: "load"; brief: AnimeBrief }
  | { type: "edit-shot"; id: string; changes: Partial<Pick<AnimeShot, "title" | "description" | "dialogue" | "camera" | "locationId" | "characterId" | "seconds">> }
  | { type: "move-shot"; id: string; direction: -1 | 1 }
  | { type: "duplicate-shot"; id: string }
  | { type: "remove-shot"; id: string }
  | { type: "add-shot" }
  | { type: "edit-character"; id: string; changes: Partial<Pick<AnimeCharacter, "name" | "description" | "locked" | "voice">> }
  | { type: "edit-location"; id: string; changes: Partial<Pick<AnimeLocation, "name" | "description">> }
  | { type: "sound"; narration?: boolean; music?: string };

export function animePreviewReducer(state: AnimePreview, action: AnimePreviewAction): AnimePreview {
  switch (action.type) {
    case "load": return createAnimePreview(action.brief);
    case "edit-shot": return { ...state, shots: state.shots.map(shot => shot.id !== action.id ? shot : {
      ...shot, ...action.changes,
      seconds: action.changes.seconds === undefined ? shot.seconds : Math.min(30, Math.max(1, Math.round(action.changes.seconds) || 1)),
    }) };
    case "move-shot": {
      const index = state.shots.findIndex(shot => shot.id === action.id), next = index + action.direction;
      if (index < 0 || next < 0 || next >= state.shots.length) return state;
      const shots = [...state.shots]; [shots[index], shots[next]] = [shots[next], shots[index]];
      return { ...state, shots };
    }
    case "duplicate-shot": {
      const index = state.shots.findIndex(shot => shot.id === action.id);
      if (index < 0 || state.shots.length >= MAX_ANIME_SHOTS) return state;
      const shots = [...state.shots]; shots.splice(index + 1, 0, { ...shots[index], id: `shot-${state.nextShotId}`, title: `${shots[index].title} (copy)` });
      return { ...state, shots, nextShotId: state.nextShotId + 1 };
    }
    case "remove-shot": return { ...state, shots: state.shots.filter(shot => shot.id !== action.id) };
    case "add-shot": return state.shots.length >= MAX_ANIME_SHOTS ? state : { ...state, nextShotId: state.nextShotId + 1, shots: [...state.shots, {
      id: `shot-${state.nextShotId}`, title: "An unwritten moment", seconds: 5, description: "Describe one clear action for this shot.", dialogue: "", camera: "Wide shot", locationId: "city", characterId: "mira",
    }] };
    case "edit-character": return { ...state, characters: state.characters.map(character => character.id === action.id ? { ...character, ...action.changes } : character) };
    case "edit-location": return { ...state, locations: state.locations.map(location => location.id === action.id ? { ...location, ...action.changes } : location) };
    case "sound": return { ...state, narration: action.narration ?? state.narration, music: action.music ?? state.music };
  }
}

export function animePreviewExport(project: AnimePreview) {
  return { schemaVersion: 1, kind: "anime-studio-static-plan", generatedMedia: false, notice: "A locally edited sample plan. No AI generation, model request, payment, or cloud save has occurred.", project };
}
