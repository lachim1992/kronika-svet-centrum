import fs from 'fs';
let content = fs.readFileSync('src/components/map/IsometricSquareMap.tsx', 'utf8');

// The sed command I ran earlier might have already added hasInitialized. Let's clean up first if needed.
// But I'll just be careful with the replace.

// Fix selection effect
const selectionEffectStart = content.indexOf('useEffect(() => {', content.indexOf('void loadTileParcels(cell.a, cell.b);') - 300);
const selectionEffectEnd = content.indexOf('}, [selected, selectedNodeId, nodes, entityCell, tileCell, loadTileParcels]);');

if (selectionEffectStart !== -1 && selectionEffectEnd !== -1) {
  const oldEffect = content.substring(selectionEffectStart, selectionEffectEnd + 78);
  const newEffect = `useEffect(() => {
    if (!selected) {
      setTileParcels([]);
      setSelectedParcelId(null);
      setSelectedNodeId(null);
      lastSelectedId.current = null;
      return;
    }

    if (selected.id !== lastSelectedId.current) {
      setSelectedParcelId(null);
      lastSelectedId.current = selected.id;
      const cell = tileCell(selected);
      void loadTileParcels(cell.a, cell.b);
    }

    if (selectedNodeId) {
      const node = nodes.find(item => item.id === selectedNodeId);
      const cell = node ? entityCell(node) : null;
      const selectedTileCell = tileCell(selected);
      if (!cell || cell.a !== selectedTileCell.a || cell.b !== selectedTileCell.b) setSelectedNodeId(null);
    }
  }, [selected, selectedNodeId, nodes, entityCell, tileCell, loadTileParcels]);`;
  content = content.replace(oldEffect, newEffect);
}

fs.writeFileSync('src/components/map/IsometricSquareMap.tsx', content);
