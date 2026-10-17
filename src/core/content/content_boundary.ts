/** Configuration and authentication are deliberately outside the content reset boundary. */
export function isContentMutationPath(path: string): boolean {
  return (
    /^\/api\/admin\/(cms|media|events|forms|inbox|members|calendar|partners|projects)(\/|$)/u.test(
      path,
    ) ||
    /^\/api\/(forms|events|membership|registrations|guest|calendar|account)(\/|$)/u.test(
      path,
    )
  );
}
export const contentGenerationHeader = "X-RotaPress-Content-Generation";
