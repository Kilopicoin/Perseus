import React from "react";
import "./App.css";

// Put your image file in src/ (or src/assets/) and update the path/name below
import alienShip from "./alien-ship.png";

export default function App() {
  return (
    <main className="centered">
      <img
        className="ship"
        src={alienShip}
        alt="Alien ship concept art"
        draggable="false"
      />
    </main>
  );
}
