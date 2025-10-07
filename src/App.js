import React from "react";
import { FaGithub } from "react-icons/fa"; // GitHub icon
import "./App.css";
import alienShip from "./alien-ship.png";

export default function App() {
  return (
    <main className="centered">
      <a
        className="github-icon"
        href="https://github.com/Kilopicoin/Perseus"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FaGithub size={40} />
      </a>

      <img
        className="ship"
        src={alienShip}
        alt="Alien ship concept art"
        draggable="false"
      />
    </main>
  );
}
