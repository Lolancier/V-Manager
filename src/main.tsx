import RuntimeApp from "./App";
import "./styles.css";
import { mountWindowRoot } from "./entries/mount-root";

mountWindowRoot(<RuntimeApp viewMode="pet" />);
