import React, { useState } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import TopBar from './TopBar';
import SettingsPanel from '../Settings/SettingsPanel';
import './Layout.css';

const MainLayout = ({ children }) => {
    const [showSettings, setShowSettings] = useState(false);

    return (
        <div className="main-layout">
            <div className="layout-sidebar">
                <Sidebar onOpenSettings={() => setShowSettings(true)} />
            </div>

            <div className="layout-content">
                <TopBar onOpenSettings={() => setShowSettings(true)} />
                <main className="main-view">
                    {children}
                </main>
            </div>

            <div className="layout-mobile-nav">
                <MobileNav onOpenSettings={() => setShowSettings(true)} />
            </div>

            <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </div>
    );
};

export default MainLayout;
