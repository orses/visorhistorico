// INSTRUCCIONES: Reemplazar la función processFiles (línea 112-144) con esta versión mejorada

async function processFiles(files) {
    // Indicador de progreso visual
    galleryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
            <h3 style="color: var(--gold); margin-bottom: 1rem;">Procesando imágenes...</h3>
            <div style="background: var(--bg-secondary); border-radius: 8px; height: 40px; overflow: hidden; margin: 0 auto 1rem; max-width: 400px; border: 1px solid var(--border);">
                <div id="progressBar" style="height: 100%; background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%); width: 0%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: var(--bg-primary); font-weight: 600;"></div>
            </div>
            <div id="progressText" style="color: var(--text-secondary); font-size: 0.95rem;">Iniciando...</div>
        </div>
    `;
    
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    let processed = 0;
    const total = files.length;
    
    for (const file of files) {
        const filename = file.name;
        
        // Actualizar progreso
        processed++;
        const percentage = Math.round((processed / total) * 100);
        progressBar.style.width = percentage + '%';
        progressBar.textContent = percentage + '%';
        progressText.textContent = `${processed} de ${total} imágenes`;
        
        // Generar metadatos
        const metadata = metadataManager.parseFilename(filename);
        
        // Geolocalizar
        if (metadata.location) {
            const coords = metadataManager.getCoordinates(metadata.location);
            if (coords) {
                metadata.coordinates = coords;
            }
        }
        
        metadataManager.updateMetadata(filename, metadata);
        
        // Guardar blob URL
        imageFiles[filename] = URL.createObjectURL(file);
        
        // Pausa cada 10 archivos para actualizar UI
        if (processed % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    
    // Completado
    progressText.textContent = '✓ Completado';
    progressText.style.color = '#2ecc71'; // verde
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Actualizar
    currentImages = Object.keys(metadataManager.getAllMetadata());
    filteredImages = [...currentImages];
    
    renderGallery(currentImages);
    renderCenturyFilters();
    updateMapMarkers();
    
    console.log(`✓ ${currentImages.length} imágenes cargadas`);
}
