function notFound(req, res, next) {
  res.status(404).json({ mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (process.env.NODE_ENV !== 'production') {
    console.error(error);
  }

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ mensaje: 'El registro ya existe o contiene un dato duplicado.' });
  }
  if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(409).json({ mensaje: 'No se puede completar la operacion por una relacion con otros registros.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ mensaje: 'La solicitud excede el tamano permitido.' });
  }

  return res.status(error.status || 500).json({
    mensaje: error.status && error.status < 500 ? error.message : 'Ocurrio un error interno en el servidor.'
  });
}

module.exports = { notFound, errorHandler };
