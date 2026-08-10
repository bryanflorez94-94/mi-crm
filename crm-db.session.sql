DELETE FROM usuarios WHERE correo_electronico = 'bryanflorez94@gmail.com';
INSERT INTO usuarios (nombre, correo_electronico, password_hash, rol) 
VALUES ('Bryan Admin', 'bryanflorez94@gmail.com', 'Sarah100619.', 'admin');