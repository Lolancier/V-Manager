import RuntimeApp from "../App";
import "../styles.css";
import "../styles/window-scale.css";
import { mountWindowRoot } from "./mount-root";

mountWindowRoot(<RuntimeApp viewMode="scale" />);
