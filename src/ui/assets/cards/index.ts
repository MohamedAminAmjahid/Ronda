import type { ImageSourcePropType } from 'react-native'
import type { Suit } from '../../../engine/types'

// Cartes en PNG (générées depuis les SVG recolorés, width 200px ≈ 2.7× la taille
// d'affichage la plus grande). Metro exige des require() statiques → map explicite.
// Total ~1.5 Mo (vs 59 Mo en SVG inline auparavant).
const CARDS: Record<Suit, Record<number, ImageSourcePropType>> = {
  oros: {
    1:  require('../../../../assets/cards/oros_1.png'),
    2:  require('../../../../assets/cards/oros_2.png'),
    3:  require('../../../../assets/cards/oros_3.png'),
    4:  require('../../../../assets/cards/oros_4.png'),
    5:  require('../../../../assets/cards/oros_5.png'),
    6:  require('../../../../assets/cards/oros_6.png'),
    7:  require('../../../../assets/cards/oros_7.png'),
    10: require('../../../../assets/cards/oros_10.png'),
    11: require('../../../../assets/cards/oros_11.png'),
    12: require('../../../../assets/cards/oros_12.png'),
  },
  copas: {
    1:  require('../../../../assets/cards/copas_1.png'),
    2:  require('../../../../assets/cards/copas_2.png'),
    3:  require('../../../../assets/cards/copas_3.png'),
    4:  require('../../../../assets/cards/copas_4.png'),
    5:  require('../../../../assets/cards/copas_5.png'),
    6:  require('../../../../assets/cards/copas_6.png'),
    7:  require('../../../../assets/cards/copas_7.png'),
    10: require('../../../../assets/cards/copas_10.png'),
    11: require('../../../../assets/cards/copas_11.png'),
    12: require('../../../../assets/cards/copas_12.png'),
  },
  espadas: {
    1:  require('../../../../assets/cards/espadas_1.png'),
    2:  require('../../../../assets/cards/espadas_2.png'),
    3:  require('../../../../assets/cards/espadas_3.png'),
    4:  require('../../../../assets/cards/espadas_4.png'),
    5:  require('../../../../assets/cards/espadas_5.png'),
    6:  require('../../../../assets/cards/espadas_6.png'),
    7:  require('../../../../assets/cards/espadas_7.png'),
    10: require('../../../../assets/cards/espadas_10.png'),
    11: require('../../../../assets/cards/espadas_11.png'),
    12: require('../../../../assets/cards/espadas_12.png'),
  },
  bastos: {
    1:  require('../../../../assets/cards/bastos_1.png'),
    2:  require('../../../../assets/cards/bastos_2.png'),
    3:  require('../../../../assets/cards/bastos_3.png'),
    4:  require('../../../../assets/cards/bastos_4.png'),
    5:  require('../../../../assets/cards/bastos_5.png'),
    6:  require('../../../../assets/cards/bastos_6.png'),
    7:  require('../../../../assets/cards/bastos_7.png'),
    10: require('../../../../assets/cards/bastos_10.png'),
    11: require('../../../../assets/cards/bastos_11.png'),
    12: require('../../../../assets/cards/bastos_12.png'),
  },
}

/** Source PNG d'une carte, prête pour <Image source={...} />. */
export function getCardImage(suit: Suit, value: number): ImageSourcePropType | undefined {
  return CARDS[suit]?.[value]
}
