/**
 * Shared shading hooks. الفراسة desaturates the whole world through ONE uniform:
 *   - built-in materials: G.shade.patch(material)  (the asset loader patches every GLB material)
 *   - custom ShaderMaterials: add `uFirasa: G.shade.uFirasa` to uniforms, prepend SHADE_PARS_FRAGMENT to the fragment
 *     shader and put SHADE_FRAGMENT as the LAST statement of main() (after tone mapping, colour space and fog).
 * Clue glows / markers must NOT include it (they stay saturated).
 */
export const SHADE_PARS_FRAGMENT = 'uniform float uFirasa;\n';
export const SHADE_FRAGMENT = `
  { float hsL = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(hsL), 0.65 * uFirasa) * (1.0 - 0.12 * uFirasa); }
`;

export function createShade() {
  const uFirasa = { value: 0 };
  /** Patch a built-in material (Lambert/Basic/Standard/Points/Sprite) in place. Idempotent. */
  function patch(mat) {
    if (!mat || mat.userData.hsShade || mat.isShaderMaterial) return mat;
    mat.userData.hsShade = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(mat, shader, renderer);
      shader.uniforms.uFirasa = uFirasa;
      shader.fragmentShader = SHADE_PARS_FRAGMENT + shader.fragmentShader.replace('#include <dithering_fragment>', SHADE_FRAGMENT + '#include <dithering_fragment>');
    };
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hs-shade';
    mat.needsUpdate = true;
    return mat;
  }
  return { uFirasa, patch };
}
