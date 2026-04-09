export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
}

export interface Screen {
  width: number;
  height: number;
  chars: string[];
  styles: Uint16Array;
  damage: Rect | null;
}

export class StylePool {
  private readonly styles = new Map<string, number>();
  private readonly values: CellStyle[] = [{}];

  constructor() {
    this.styles.set(this.serialize({}), 0);
  }

  get none(): number {
    return 0;
  }

  intern(style: CellStyle): number {
    const normalized: CellStyle = {
      color: style.color,
      backgroundColor: style.backgroundColor,
      bold: style.bold ? true : undefined,
      dim: style.dim ? true : undefined,
    };
    const key = this.serialize(normalized);
    const existing = this.styles.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.values.length;
    this.values.push(normalized);
    this.styles.set(key, id);
    return id;
  }

  get(id: number): CellStyle {
    return this.values[id] ?? this.values[0]!;
  }

  private serialize(style: CellStyle): string {
    return JSON.stringify(style);
  }
}

export function createScreen(width: number, height: number): Screen {
  return {
    width,
    height,
    chars: new Array(Math.max(0, width * height)).fill(" "),
    styles: new Uint16Array(Math.max(0, width * height)),
    damage: null,
  };
}

export function resetScreen(screen: Screen, width: number, height: number): void {
  screen.width = width;
  screen.height = height;
  const size = Math.max(0, width * height);
  screen.chars = new Array(size).fill(" ");
  screen.styles = new Uint16Array(size);
  screen.damage = null;
}

export function getIndex(screen: Screen, x: number, y: number): number {
  return y * screen.width + x;
}

export function setCell(
  screen: Screen,
  x: number,
  y: number,
  char: string,
  styleId: number,
): void {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) {
    return;
  }

  const index = getIndex(screen, x, y);
  screen.chars[index] = char;
  screen.styles[index] = styleId;
  markDamage(screen, { x, y, width: 1, height: 1 });
}

export function fillRect(
  screen: Screen,
  rect: Rect,
  styleId: number,
  char = " ",
): void {
  const startX = Math.max(0, rect.x);
  const startY = Math.max(0, rect.y);
  const endX = Math.min(screen.width, rect.x + rect.width);
  const endY = Math.min(screen.height, rect.y + rect.height);

  if (startX >= endX || startY >= endY) {
    return;
  }

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = getIndex(screen, x, y);
      screen.chars[index] = char;
      screen.styles[index] = styleId;
    }
  }

  markDamage(screen, {
    x: startX,
    y: startY,
    width: endX - startX,
    height: endY - startY,
  });
}

export function markDamage(screen: Screen, rect: Rect): void {
  if (!screen.damage) {
    screen.damage = { ...rect };
    return;
  }

  const x1 = Math.min(screen.damage.x, rect.x);
  const y1 = Math.min(screen.damage.y, rect.y);
  const x2 = Math.max(screen.damage.x + screen.damage.width, rect.x + rect.width);
  const y2 = Math.max(screen.damage.y + screen.damage.height, rect.y + rect.height);
  screen.damage = {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

export function rowEquals(previous: Screen, next: Screen, row: number): boolean {
  if (previous.width !== next.width || previous.height !== next.height) {
    return false;
  }

  for (let x = 0; x < next.width; x++) {
    const index = getIndex(next, x, row);
    if (
      previous.chars[index] !== next.chars[index] ||
      previous.styles[index] !== next.styles[index]
    ) {
      return false;
    }
  }
  return true;
}
