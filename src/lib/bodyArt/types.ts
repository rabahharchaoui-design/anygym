// The shape of one upstream body part (react-native-body-highlighter's BodyPart, data fields only).
export interface ArtPart {
  slug: string;
  color?: string;
  path: { common?: string[]; left?: string[]; right?: string[] };
}
