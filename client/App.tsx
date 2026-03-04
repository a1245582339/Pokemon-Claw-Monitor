import { Routes, Route } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { PokemonPage } from "./pages/PokemonPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/pokemon" element={<PokemonPage />} />
    </Routes>
  );
}
