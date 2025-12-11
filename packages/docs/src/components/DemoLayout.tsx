import { ReactNode, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Drawer,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
  Collapse,
  Stack,
  Chip,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import BarChartIcon from '@mui/icons-material/BarChart';
import TuneIcon from '@mui/icons-material/Tune';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';

interface DemoLayoutProps {
  title: string;
  description: string;
  features?: string[];
  children: ReactNode;
  code?: string;
  controls?: ReactNode;
  chips?: string[];
}

type PanelTab = 'info' | 'controls' | 'source' | false;

export default function DemoLayout({
  title,
  description,
  features = [],
  children,
  code,
  controls,
  chips = [],
}: DemoLayoutProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('md'));
  const isXSmall = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [activeTab, setActiveTab] = useState<PanelTab>(false);
  const [showStats, setShowStats] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);

  const handleTabChange = (_: React.SyntheticEvent, newValue: PanelTab) => {
    if (activeTab === newValue) {
      setActiveTab(false);
    } else {
      setActiveTab(newValue);
    }
  };

  const handleTabClick = (tab: PanelTab) => {
    if (activeTab === tab) {
      setActiveTab(false);
    } else {
      setActiveTab(tab);
    }
  };

  const closePanel = () => setActiveTab(false);

  const InfoContent = () => (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" color="primary.main" gutterBottom sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {chips.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5, mb: 2 }}>
          {chips.map((chip, i) => (
            <Chip key={i} label={chip} size="small" variant="outlined" color="primary" />
          ))}
        </Stack>
      )}
      {features.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Features:
          </Typography>
          <Stack spacing={0.5}>
            {features.map((feature, i) => (
              <Typography key={i} variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                • {feature}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );

  const ControlsContent = () => (
    <Box sx={{ p: 2 }}>
      {controls || (
        <Typography variant="body2" color="text.secondary">
          No controls available for this demo.
        </Typography>
      )}
    </Box>
  );

  const SourceContent = () => (
    <Box sx={{ p: 2, maxHeight: isSmall ? '50vh' : 400, overflow: 'auto' }}>
      {code ? (
        <Box
          component="pre"
          sx={{
            m: 0,
            fontSize: isXSmall ? '0.65rem' : '0.75rem',
            lineHeight: 1.5,
            color: 'text.primary',
            fontFamily: '"Fira Code", "Monaco", monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <code>{code}</code>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No source code available.
        </Typography>
      )}
    </Box>
  );

  const getPanelContent = () => {
    if (activeTab === 'info') return <InfoContent />;
    if (activeTab === 'controls') return <ControlsContent />;
    if (activeTab === 'source') return <SourceContent />;
    return null;
  };

  const ToolbarContent = () => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: { xs: 1, sm: 2 },
        py: 0.5,
        bgcolor: 'rgba(5, 5, 8, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        minHeight: 48,
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Typography
          variant="subtitle1"
          sx={{
            color: 'primary.main',
            fontWeight: 600,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: { xs: '0.875rem', sm: '1rem' },
          }}
        >
          {title}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36,
              minWidth: { xs: 'auto', sm: 80 },
              px: { xs: 1, sm: 2 },
              fontSize: { xs: '0.7rem', sm: '0.8rem' },
            },
          }}
        >
          <Tab
            icon={<InfoIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />}
            iconPosition="start"
            label={isXSmall ? '' : 'Info'}
            value="info"
            onClick={() => handleTabClick('info')}
          />
          {controls && (
            <Tab
              icon={<TuneIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />}
              iconPosition="start"
              label={isXSmall ? '' : 'Controls'}
              value="controls"
              onClick={() => handleTabClick('controls')}
            />
          )}
          {code && (
            <Tab
              icon={<CodeIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />}
              iconPosition="start"
              label={isXSmall ? '' : 'Source'}
              value="source"
              onClick={() => handleTabClick('source')}
            />
          )}
        </Tabs>

        <Tooltip title="Toggle Stats">
          <IconButton
            size="small"
            onClick={() => setShowStats(!showStats)}
            sx={{
              color: showStats ? 'primary.main' : 'text.secondary',
              bgcolor: showStats ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
            }}
          >
            <BarChartIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {activeTab !== false && !isSmall && (
          <Tooltip title={panelExpanded ? 'Collapse' : 'Expand'}>
            <IconButton
              size="small"
              onClick={() => setPanelExpanded(!panelExpanded)}
              sx={{ color: 'text.secondary' }}
            >
              {panelExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  const DesktopPanel = () => (
    <Collapse in={activeTab !== false && panelExpanded}>
      <Box
        sx={{
          bgcolor: 'rgba(0, 0, 0, 0.9)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          maxHeight: 300,
          overflow: 'auto',
        }}
      >
        {getPanelContent()}
      </Box>
    </Collapse>
  );

  const MobileDrawer = () => (
    <Drawer
      anchor="bottom"
      open={activeTab !== false}
      onClose={closePanel}
      PaperProps={{
        sx: {
          bgcolor: 'rgba(10, 10, 15, 0.98)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '70vh',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography variant="subtitle2" color="primary.main" sx={{ pl: 1 }}>
          {activeTab === 'info' && 'Info'}
          {activeTab === 'controls' && 'Controls'}
          {activeTab === 'source' && 'Source Code'}
        </Typography>
        <IconButton size="small" onClick={closePanel}>
          <CloseIcon />
        </IconButton>
      </Box>
      {getPanelContent()}
    </Drawer>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <ToolbarContent />
      
      {!isSmall && <DesktopPanel />}

      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Canvas
          camera={{ position: [5, 5, 5], fov: 60 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#0a0a0f']} />
          {showStats && <Stats />}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxPolarAngle={Math.PI / 2 + 0.1}
          />
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          {children}
        </Canvas>
      </Box>

      <Box
        sx={{
          bgcolor: 'rgba(0, 0, 0, 0.6)',
          py: 0.5,
          textAlign: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
          Drag to rotate • Scroll to zoom • Right-click to pan
        </Typography>
      </Box>

      {isSmall && <MobileDrawer />}
    </Box>
  );
}
