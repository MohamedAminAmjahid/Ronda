import { router } from 'expo-router'
import { CosmeticsShopScreen } from '../ui/CosmeticsShopScreen'

export default function CosmeticsRoute() {
  return <CosmeticsShopScreen onBack={() => router.back()} />
}
