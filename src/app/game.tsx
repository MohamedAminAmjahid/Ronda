import { router } from 'expo-router';
import { GameScreen } from '../ui/GameScreen';

export default function GameRoute() {
  return <GameScreen onBack={() => router.back()} />;
}
