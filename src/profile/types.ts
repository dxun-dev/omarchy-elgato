import type { StreamDeckControlDefinition } from '@elgato-stream-deck/node';

export interface Key {
  label: string;
  action: string;
  icon?: string;
  displayText?: string;
  displayMode?: 'text' | 'icon-text' | 'icon' | 'color' | 'color-text';
  color?: number[];
  textColor?: number[];
  stateAction?: string;
  stateIcons?: Record<string, string>;
}
export interface Dial {
  label: string;
  left: string;
  right: string;
  press: string;
  color?: number[];
  display?: Key;
}
export interface Light {
  name: string;
  host: string;
  port: number;
}
export interface LightState extends Light {
  reachable: boolean;
  on?: number;
  brightness?: number;
  temperature?: number;
  error?: string;
}
export interface Profile {
  name: string;
  brightness: number;
  keys: Key[];
  classicKeys: Key[];
  dials: Dial[];
  lights: Light[];
  devices?: Record<string, DeviceMapping>;
  pages?: Record<string, PageSet>;
}
export interface DeviceMapping {
  keys: Key[];
  dials: Dial[];
}
export interface Page extends DeviceMapping {
  id: string;
  name: string;
  kind?: 'folder';
}
export interface PageSet {
  active: string;
  items: Page[];
  history?: string[];
}
export interface DeckModel {
  id: string;
  name: string;
  models: string[];
  controls: StreamDeckControlDefinition[];
}
