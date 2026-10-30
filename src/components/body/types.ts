// SPDX-License-Identifier: MIT
// Copyright (c) 2022 ELABBASSI Hicham
// The shape of react-native-body-highlighter's body data (MIT, see ./LICENSE).

export interface BodyPart {
  slug: string;
  color?: string;
  /** Plain SVG path strings: left and right halves shade separately, common ones are a single shape. */
  path: { left?: string[]; right?: string[]; common?: string[] };
}
