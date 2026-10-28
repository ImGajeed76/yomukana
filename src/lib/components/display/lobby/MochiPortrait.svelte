<script lang="ts">
  import {
    Mesh,
    NeutralToneMapping,
    PerspectiveCamera,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer,
  } from "three";
  import { doughMaterial, doughShape, paintFace, randomFrom } from "./dough";

  // The daifuku on the simple board's room button, rendered with the lobby's
  // own shader into the two pictures in static/lobby/: looking at you, and
  // glancing up and aside when the button is hovered. Pictures, so the simple
  // board never loads three.js for a button. Only for `/display?debug=mochi`
  // on this machine: change the dough or the face, open it, and save the two
  // pictures over the old ones.

  /** Pixels a side: three times the button's 32, for sharp screens. */
  const SIZE = 96;

  let pictures = $state<{ name: string; url: string }[]>([]);

  $effect(() => {
    const canvas = document.createElement("canvas");
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = NeutralToneMapping;
    const camera = new PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.85, 2.7);
    camera.lookAt(0, 0.02, 0);
    camera.updateMatrixWorld();
    const light = new Vector3(-0.4, 1, 0.5)
      .normalize()
      .transformDirection(camera.matrixWorldInverse);
    const random = randomFrom("yomukana");
    const material = doughMaterial("green", random, light);
    const body = new Mesh(doughShape(random), material);
    body.rotation.y = -0.15;
    const scene = new Scene();
    scene.add(body);

    const shoot = (name: string, look: Vector2, open: number): { name: string; url: string } => {
      paintFace(material, { open, happy: 0, look });
      renderer.render(scene, camera);
      return { name, url: canvas.toDataURL("image/png") };
    };
    pictures = [
      shoot("mochi.png", new Vector2(0, 0), 1),
      shoot("mochi-look.png", new Vector2(0.2, 0.08), 1),
    ];
    return () => {
      body.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  });
</script>

<div class="flex flex-1 items-center justify-center gap-8 bg-muted p-8">
  {#each pictures as picture (picture.name)}
    <a href={picture.url} download={picture.name} class="flex flex-col items-center gap-2 text-sm">
      <img src={picture.url} alt="" class="size-24" />
      {picture.name}
    </a>
  {/each}
</div>
