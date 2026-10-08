export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface Point {
  x: number;
  y: number;
}

export interface Keyframe<T> {
  id: string;
  time: number; // seconds, relative to composition start
  value: T;
  easing: Easing;
}

export interface AnimatedProperty<T> {
  static: T; // value used when there are no keyframes
  keyframes: Keyframe<T>[];
}

export interface LayerTransform {
  position: AnimatedProperty<Point>;
  scale: AnimatedProperty<Point>; // 1 = 100%
  rotation: AnimatedProperty<number>; // degrees
  opacity: AnimatedProperty<number>; // 0..1
}

export type LayerType =
  | "text"
  | "rect"
  | "ellipse"
  | "polygon"
  | "star"
  | "image"
  | "video"
  | "audio"
  | "caption"
  | "glass"
  | "overlay";

export interface TextLayerProps {
  content: string; // wrap a word in [brackets] to render it in emphasisColor
  fontSize: number;
  color: string;
  fontFamily: string;
  align: "left" | "center" | "right";
  bold?: boolean;
  emphasisColor?: string; // color for [bracketed] words in content
  revealSpeed?: number; // chars/sec — types content on progressively, like a typewriter
  countTo?: number; // when set, content is replaced by a 0 → countTo counter
  countDuration?: number; // seconds the count-up takes
  glow?: string; // neon glow color around the text
  outline?: boolean; // draw only the letter outlines (big hollow numbers)
  stretchIn?: number; // seconds of Arabic kashida "stretch" that shrinks back as the text appears
}

export interface ShapeLayerProps {
  width: number;
  height: number;
  color: string;
  radius?: number; // rect corner radius
}

export interface PolygonLayerProps {
  width: number;
  height: number;
  color: string;
  sides: number; // 3..12
}

export interface StarLayerProps {
  width: number;
  height: number;
  color: string;
  points: number; // 3..12
  innerRatio: number; // 0..1, inner radius as a fraction of outer radius
}

export interface ImageLayerProps {
  src: string; // data URL
  width: number;
  height: number;
}

export interface VideoLayerProps {
  src: string; // object URL (session-only — not persisted across reloads)
  fileName: string;
  width: number;
  height: number;
  trimIn: number; // seconds into the source video where playback starts
  naturalDuration: number; // source video's own duration, seconds
  muted: boolean;
}

export interface AudioLayerProps {
  src: string; // object URL (session-only — not persisted across reloads)
  fileName: string;
  trimIn: number; // seconds into the source audio where playback starts
  naturalDuration: number; // source audio's own duration, seconds
  muted: boolean;
}

export type CaptionStyle = "bigWord" | "karaokeLine" | "pillWord" | "emphasisOnly" | "buildUp" | "phraseStack";

export interface CaptionWord {
  id: string;
  text: string;
  start: number; // seconds, relative to the source media's own timeline
  end: number;
  emphasis: boolean;
}

export interface CaptionLayerProps {
  words: CaptionWord[];
  style: CaptionStyle;
  fontSize: number;
  color: string;
  emphasisColor: string;
  fontFamily: string;
  /** trimIn of the source layer at the moment captions were generated, so timing stays in sync. */
  sourceTrimIn: number;
  sourceLayerName: string; // informational only
}

export interface GlassLayerProps {
  width: number;
  height: number;
  radius: number;
  blur: number; // px
  tint: string; // rgba() overlay color on top of the blurred sample
  borderColor: string;
}

export type OverlayEffect = "grain" | "vhs" | "vignette" | "scanlines";

export interface OverlayLayerProps {
  effect: OverlayEffect;
  intensity: number; // 0..1
  width: number;
  height: number;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  startTime: number; // seconds
  endTime: number; // seconds
  transform: LayerTransform;
  props:
    | TextLayerProps
    | ShapeLayerProps
    | PolygonLayerProps
    | StarLayerProps
    | ImageLayerProps
    | VideoLayerProps
    | AudioLayerProps
    | CaptionLayerProps
    | GlassLayerProps
    | OverlayLayerProps;
}

export type ColorGradeId =
  | "none"
  | "tealOrange"
  | "moodyBlue"
  | "warmFilm"
  | "noir"
  | "vintageSepia"
  | "highContrast"
  | "cyberpunk"
  | "fadedPastel"
  | "goldenHour"
  | "dayForNight";

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  backgroundColor: string;
  colorGrade: ColorGradeId; // cinematic color-grade "look" applied over the whole composite
  layers: Layer[]; // index 0 = topmost / front
}

export interface Project {
  id: string;
  name: string;
  composition: Composition;
}

export type AnimatablePropKey = "position" | "scale" | "rotation" | "opacity";
