import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/manrope';
import './styles.css';
import Storefront from './Storefront';
import DemoCheckout from './DemoCheckout';
createRoot(document.getElementById('root')!).render(location.pathname==='/demo-checkout'?<DemoCheckout/>:<Storefront/>);
