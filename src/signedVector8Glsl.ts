/** Raw highp ES3 normalized numeric RGB decode; texture/filter/frame policy is external. */
export const signedVector8Glsl = /* glsl */ `
vec3 strataDecodeSignedVector8(vec3 rgb) {
  return rgb * 2.0 - 1.0;
}
`;
