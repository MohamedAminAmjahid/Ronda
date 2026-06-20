// Modules d'assets audio pour Metro/Expo : require('…wav') renvoie l'id d'asset.
declare module '*.wav' {
  const src: number
  export = src
}
declare module '*.mp3' {
  const src: number
  export = src
}
