import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/manrope';
import './styles.css';
import WallStudio from './WallStudio';
import DemoCheckout from './DemoCheckout';
createRoot(document.getElementById('root')!).render(location.pathname==='/demo-checkout'?<DemoCheckout/>:<WallStudio/>);
