export interface TypographyViewport {
  compactLandscape: boolean;
  touchOriented: boolean;
}

export interface UiTypographyProfile {
  compactPhone: boolean;
  dialogueTitle: number;
  dialogueSpeaker: number;
  dialogueBody: number;
  dialogueSkip: number;
  headingScale: number;
  bodyScale: number;
  buttonScale: number;
}

/** Text grows independently from scene/world scale on short landscape phones. */
export function getUiTypography(viewport?: TypographyViewport): UiTypographyProfile {
  const compactPhone = viewport?.compactLandscape === true && viewport.touchOriented === true;
  return compactPhone
    ? {
        compactPhone,
        dialogueTitle: 38,
        dialogueSpeaker: 27,
        dialogueBody: 34,
        dialogueSkip: 18,
        headingScale: 1.16,
        bodyScale: 1.32,
        buttonScale: 1.28,
      }
    : {
        compactPhone,
        dialogueTitle: 30,
        dialogueSpeaker: 22,
        dialogueBody: 26,
        dialogueSkip: 15,
        headingScale: 1,
        bodyScale: 1,
        buttonScale: 1,
      };
}

export function responsiveFontSize(
  desktopSize: number,
  viewport: TypographyViewport | undefined,
  kind: 'heading' | 'body' | 'button' = 'body',
): number {
  const profile = getUiTypography(viewport);
  const scale =
    kind === 'heading'
      ? profile.headingScale
      : kind === 'button'
        ? profile.buttonScale
        : profile.bodyScale;
  return Math.round(desktopSize * scale);
}
