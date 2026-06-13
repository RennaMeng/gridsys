/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LayoutBlock {
  id: string;
  type: 'image' | 'text' | 'heading' | 'container' | 'title' | 'blank';
  label: string;
  x: number; // grid col start
  y: number; // grid row start
  w: number; // grid col span
  h: number; // grid row span
  content?: string;
  category: 'Define' | 'Ideation' | 'Prototype' | 'Final' | 'Generic';
  imageUrl?: string;
  imageFit?: 'cover' | 'contain';
  imageZoom?: number;
  imagePanX?: number;
  imagePanY?: number;
  imageRotation?: 0 | 90 | 180 | 270;
  imageFlipX?: boolean;
  imageFlipY?: boolean;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold' | 'black';
  fontStyle?: 'normal' | 'italic';
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  linkUrl?: string;
  generatedByAI?: boolean;
}

export interface GridSettings {
  columns: number;
  showGrid: boolean;
  zoom: number;
  snapEnabled: boolean;
}

export type SidebarTab = 'library' | 'inspector' | 'history';
