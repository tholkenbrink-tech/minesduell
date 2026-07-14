import { useMatchStore } from './store/useMatchStore';
import { useApplyPrefs } from './hooks/useApplyPrefs';
import { ModeSelectScreen } from './screens/ModeSelectScreen';
import { PlayerSetupScreen } from './screens/PlayerSetupScreen';
import { GameConfigScreen } from './screens/GameConfigScreen';
import { BoardScreen } from './screens/BoardScreen';
import { ResultsScreen } from './screens/ResultsScreen';

function App() {
  useApplyPrefs();
  const screen = useMatchStore((s) => s.screen);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {screen === 'mode-select' && <ModeSelectScreen />}
        {screen === 'player-setup' && <PlayerSetupScreen />}
        {screen === 'game-config' && <GameConfigScreen />}
        {screen === 'board' && <BoardScreen />}
        {screen === 'results' && <ResultsScreen />}
      </div>
    </div>
  );
}

export default App;
