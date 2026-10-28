// Points popping up over a daifuku's head when its score rises: "+12", in
// the same green the board shows a gain in, rising from the name and fading.
// HTML over the canvas like the names, so it is sharp at any size.

import type { Daifuku } from "./daifuku";
import type { Corner } from "./quad";

/** How long a pop takes to rise and fade, and how far it rises, in CSS pixels. */
const SECONDS = 2;
const RISE = 46;

export class GainPops {
  private readonly pops: { daifuku: Daifuku; element: HTMLElement; age: number }[] = [];

  constructor(private readonly layer: HTMLElement) {}

  pop(daifuku: Daifuku, gain: number): void {
    const element = document.createElement("span");
    element.className = "lobby-gain";
    element.textContent = `+${String(Math.round(gain))}`;
    this.layer.append(element);
    this.pops.push({ daifuku, element, age: 0 });
  }

  /** Moves them on: `head` says where a daifuku's name sits on the page. */
  step(seconds: number, head: (daifuku: Daifuku) => Corner): void {
    for (const pop of this.pops) {
      pop.age += seconds;
      const share = Math.min(1, pop.age / SECONDS);
      const [x, y] = head(pop.daifuku);
      // Eased out: quick off the head, slowing as it fades.
      const rise = RISE * (1 - (1 - share) * (1 - share));
      pop.element.style.transform = `translate(${x.toFixed(1)}px, ${(y - rise).toFixed(1)}px) translate(-50%, -150%)`;
      pop.element.style.opacity = String(share < 0.7 ? 1 : (1 - share) / 0.3);
    }
    for (const pop of this.pops.filter((one) => one.age >= SECONDS)) {
      pop.element.remove();
      this.pops.splice(this.pops.indexOf(pop), 1);
    }
  }

  dispose(): void {
    for (const pop of this.pops) pop.element.remove();
    this.pops.length = 0;
  }
}
