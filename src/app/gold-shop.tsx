import { router } from 'expo-router'
import { GoldShopScreen } from '../ui/GoldShopScreen'

export default function GoldShopRoute() {
  return <GoldShopScreen onBack={() => router.back()} />
}
