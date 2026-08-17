import RuntimeApp from "../App";
import "../styles.css";
import "../styles/window-startup.css";
import { mountWindowRoot } from "./mount-root";

mountWindowRoot(<RuntimeApp viewMode="startup" />);
