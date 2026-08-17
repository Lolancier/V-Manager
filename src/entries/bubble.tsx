import RuntimeApp from "../App";
import "../styles.css";
import "../styles/window-bubble.css";
import { mountWindowRoot } from "./mount-root";

mountWindowRoot(<RuntimeApp viewMode="bubble" />);
