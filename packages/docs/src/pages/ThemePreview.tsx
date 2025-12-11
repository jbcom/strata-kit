import { useState } from 'react';
import { Box, Container, Typography, Card, CardMedia, CardContent, Grid, Button, Chip, Stack } from '@mui/material';

interface ThemeOption {
  id: string;
  name: string;
  tagline: string;
  description: string;
  heroImage: string;
  logoImage: string;
  colors: {
    primary: string;
    secondary: string;
    accent?: string;
    background: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  mood: string[];
}

const themes: ThemeOption[] = [
  {
    id: 'neon-blueprint',
    name: 'Neon Blueprint',
    tagline: 'Programmable Holography',
    description: 'High-end design tool aesthetic. Crisp cyan and magenta accents over charcoal foundations. Feels like a premium creative suite for limitless generative systems.',
    heroImage: '/themes/hero-neon-blueprint.png',
    logoImage: '/themes/logo-neon-blueprint.png',
    colors: {
      primary: '#11CDEF',
      secondary: '#FF4AA9',
      background: '#0B1A21',
    },
    fonts: {
      heading: 'Space Grotesk',
      body: 'IBM Plex Sans',
      mono: 'IBM Plex Mono',
    },
    mood: ['Technical', 'Premium', 'Modern', 'Clean'],
  },
  {
    id: 'spectrum-flux',
    name: 'Spectrum Flux',
    tagline: 'Creative Lab',
    description: 'Electric gradient palette with animated beam aesthetic. Purple, pink, and teal create a vibrant creative lab vibe for experimental generative art.',
    heroImage: '/themes/hero-spectrum-flux.png',
    logoImage: '/themes/logo-spectrum-flux.png',
    colors: {
      primary: '#5F5BEB',
      secondary: '#FF7BC9',
      accent: '#4EFFE1',
      background: '#070A14',
    },
    fonts: {
      heading: 'Sora',
      body: 'DM Sans',
      mono: 'JetBrains Mono',
    },
    mood: ['Creative', 'Vibrant', 'Experimental', 'Bold'],
  },
  {
    id: 'algorithmic-alloy',
    name: 'Algorithmic Alloy',
    tagline: 'Precision Engineering',
    description: 'Industrial tech credibility with graphite foundations. Lime green and cyan duotone suggests precision machinery and algorithmic power.',
    heroImage: '/themes/hero-algorithmic-alloy.png',
    logoImage: '/themes/logo-algorithmic-alloy.png',
    colors: {
      primary: '#D7FC70',
      secondary: '#4CD7F6',
      background: '#101418',
    },
    fonts: {
      heading: 'Archivo Black',
      body: 'General Sans',
      mono: 'Fira Code',
    },
    mood: ['Industrial', 'Technical', 'Powerful', 'Sharp'],
  },
];

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: color,
          border: '2px solid rgba(255,255,255,0.2)',
          mb: 0.5,
          mx: 'auto',
        }}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem' }}>
        {color}
      </Typography>
    </Box>
  );
}

function ThemeCard({ theme, selected, onSelect }: { theme: ThemeOption; selected: boolean; onSelect: () => void }) {
  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: selected ? `3px solid ${theme.colors.primary}` : '1px solid rgba(255,255,255,0.1)',
        transition: 'all 0.3s',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 0 30px ${theme.colors.primary}40`,
        },
      }}
      onClick={onSelect}
    >
      <CardMedia
        component="img"
        height="200"
        image={theme.heroImage}
        alt={`${theme.name} hero`}
        sx={{ objectFit: 'cover' }}
      />
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Box
            component="img"
            src={theme.logoImage}
            alt={`${theme.name} logo`}
            sx={{ width: 48, height: 48, borderRadius: 1 }}
          />
          <Box>
            <Typography variant="h6" sx={{ color: theme.colors.primary, fontWeight: 700 }}>
              {theme.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {theme.tagline}
            </Typography>
          </Box>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {theme.description}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <ColorSwatch color={theme.colors.primary} label="Primary" />
          <ColorSwatch color={theme.colors.secondary} label="Secondary" />
          {theme.colors.accent && <ColorSwatch color={theme.colors.accent} label="Accent" />}
          <ColorSwatch color={theme.colors.background} label="Background" />
        </Stack>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Typography:
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
            {theme.fonts.heading} / {theme.fonts.body}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
          {theme.mood.map((m) => (
            <Chip
              key={m}
              label={m}
              size="small"
              sx={{
                bgcolor: `${theme.colors.primary}20`,
                color: theme.colors.primary,
                fontSize: '0.65rem',
              }}
            />
          ))}
        </Stack>
      </CardContent>

      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          fullWidth
          variant={selected ? 'contained' : 'outlined'}
          sx={{
            bgcolor: selected ? theme.colors.primary : 'transparent',
            borderColor: theme.colors.primary,
            color: selected ? '#000' : theme.colors.primary,
            '&:hover': {
              bgcolor: theme.colors.primary,
              color: '#000',
            },
          }}
        >
          {selected ? 'Selected' : 'Select This Theme'}
        </Button>
      </Box>
    </Card>
  );
}

export default function ThemePreview() {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  return (
    <Box sx={{ minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 700,
              mb: 2,
              background: 'linear-gradient(135deg, #11CDEF 0%, #FF4AA9 50%, #4EFFE1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Choose Your Theme
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Three distinct visual identities for Strata. Each communicates "procedural generation of anything"
            in a different way.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {themes.map((theme) => (
            <Grid item xs={12} md={4} key={theme.id}>
              <ThemeCard
                theme={theme}
                selected={selectedTheme === theme.id}
                onSelect={() => setSelectedTheme(theme.id)}
              />
            </Grid>
          ))}
        </Grid>

        {selectedTheme && (
          <Box sx={{ mt: 6, textAlign: 'center' }}>
            <Typography variant="h5" gutterBottom>
              You selected: <strong>{themes.find((t) => t.id === selectedTheme)?.name}</strong>
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Ready to apply this theme to the entire site?
            </Typography>
            <Button
              variant="contained"
              size="large"
              sx={{
                background: `linear-gradient(135deg, ${themes.find((t) => t.id === selectedTheme)?.colors.primary} 0%, ${themes.find((t) => t.id === selectedTheme)?.colors.secondary} 100%)`,
                color: '#000',
                px: 4,
              }}
            >
              Apply Theme
            </Button>
          </Box>
        )}
      </Container>
    </Box>
  );
}
