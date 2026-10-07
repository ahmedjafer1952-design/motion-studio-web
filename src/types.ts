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

export type LayerType = "text" | "rect" | "ellipse" | "image";

export interface TextLayerProps {
  content: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  align: "left" | "center" | "right";
}

export interface ShapeLayerProps {
  width: number;
  height: number;
  color: string;
  radius?: number; // rect corner radius
}

export interface ImageLayerProps {
  src: string; // data URL
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
  props: TextLayerProps | ShapeLayerProps | ImageLayerProps;
}

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  backgroundColor: string;
  layers: Layer[]; // index 0 = topmost / front
}

export interface Project {
  id: string;
  name: string;
  composition: Composition;
}

export type AnimatablePropKey = "position" | "scale" | "rotation" | "opacity";
